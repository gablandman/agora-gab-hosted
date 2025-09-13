import os
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image
import google.generativeai as genai
from dotenv import load_dotenv
import asyncio
import uuid
import json
from background_remover import background_remove

# Load environment variables from .env file
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY_HERE")
genai.configure(api_key=GEMINI_API_KEY)

def generate_image(prompt, input_image_path=None, model="gemini-2.5-flash-image-preview"):
    """
    Generate an image using Gemini API and save it to a file

    Args:
        prompt: Text prompt for image generation
        input_image_path: Optional path to input image for image-to-image generation
        model: Gemini model to use

    Returns:
        Path to the saved generated image, or None if failed
    """
    try:
        contents = [prompt]

        # Add input image if provided
        if input_image_path:
            img = Image.open(input_image_path)
            contents.append(img)

        # Create model and generate
        gemini_model = genai.GenerativeModel(model)
        response = gemini_model.generate_content(contents)

        # Process response to extract generated image
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    # Save the generated image
                    img_data = part.inline_data.data
                    img = Image.open(BytesIO(img_data))

                    # Save with timestamp
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"generated_{timestamp}.png"
                    img.save(filename)

                    print(f"✓ Image saved to: {filename}")
                    return filename

        print("No image was generated in the response")
        return None

    except Exception as e:
        print(f"Error generating image: {e}")
        return None

async def generate_direction_async(gemini_model, direction_prompt, generated_face_img, character_id, direction_name):
    """
    Async function to generate a single directional view
    """
    try:
        response = await asyncio.to_thread(
            gemini_model.generate_content,
            [direction_prompt, generated_face_img]
        )

        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    img_data = part.inline_data.data
                    img = Image.open(BytesIO(img_data))
                    output_path = f"cache/{character_id}-{direction_name}.png"
                    img.save(output_path)
                    print(f"✓ {direction_name} view saved to: {output_path}")
                    return direction_name, output_path, img
    except Exception as e:
        print(f"Error generating {direction_name} view: {e}")
        return direction_name, None, None

def generate_character(description, character_id=None):
    """
    Generate a character in 5 different directions based on a description
    Only generates 2 images (top-left and bot-left) and flips them for opposites

    Args:
        description: Text description of the character to generate
        character_id: Optional ID for the character (will generate UUID if not provided)

    Returns:
        Dictionary with character_id and paths to generated images
    """
    if not character_id:
        character_id = str(uuid.uuid4())

    model = "gemini-2.5-flash-image-preview"
    results = {}

    try:
        # Step 1: Generate the base character face using the face template
        print(f"Generating base character from description: {description}")
        face_template = "template-images/face.png"

        if not os.path.exists(face_template):
            print(f"Error: Face template not found at {face_template}")
            return None

        face_img = Image.open(face_template)
        gemini_model = genai.GenerativeModel(model)

        face_prompt = f"""Create a pixel art character in isometric Habbo Hotel style based on this description: {description}

        IMPORTANT: The character must be FACING FORWARD (looking directly at the viewer/screen).
        - Use the provided template as a style reference
        - Character should be in a neutral standing pose
        - Maintain pixel art aesthetic with clean lines and vibrant colors
        - This will be the base design for creating other viewing angles"""

        response = gemini_model.generate_content([face_prompt, face_img])

        # Extract the generated face image
        generated_face_path = None
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    img_data = part.inline_data.data
                    img = Image.open(BytesIO(img_data))
                    generated_face_path = f"cache/{character_id}-face.png"
                    img.save(generated_face_path)

                    # Apply background removal
                    try:
                        generated_face_path = background_remove(generated_face_path)
                        print(f"✓ Background removed from face image")
                    except Exception as e:
                        print(f"Warning: Could not remove background from face: {e}")

                    results['face'] = generated_face_path
                    print(f"✓ Base character saved to: {generated_face_path}")
                    break

        if not generated_face_path:
            print("Failed to generate base character")
            return None

        # Step 2: Generate only 2 directional views (top-left and bot-left) concurrently
        directions_to_generate = [
            ('top-left', 'Show the character from a 3/4 back-left view, body turned away looking over left shoulder, showing mostly the back and left side'),
            ('bot-left', 'Show the character from a 3/4 front-left view, body angled left, face looking down-left towards the viewer\'s bottom-left')
        ]

        generated_face_img = Image.open(generated_face_path)

        print("Generating directional views concurrently...")

        # Create tasks for concurrent generation
        async def generate_all_directions():
            tasks = []
            for direction_name, direction_desc in directions_to_generate:
                direction_prompt = f"""Generate the SAME character from the provided image but rotated to a different viewing angle.

                EXACT CHARACTER TO ROTATE: The character in the provided image

                NEW VIEWING ANGLE: {direction_desc}

                CRITICAL REQUIREMENTS:
                - This is the EXACT SAME character from the input image
                - Keep ALL design elements identical: hair color/style, clothing, accessories, skin tone, everything
                - ONLY change the viewing angle/rotation
                - Maintain isometric pixel art Habbo Hotel style
                - Character should be standing in the same neutral pose but viewed from the new angle

                VISUAL DETAILS FOR THIS ANGLE:
                - In isometric view, the character is now rotated
                - You should see different sides of the character based on the rotation
                - Hair, clothing, and features should wrap around naturally for the new angle

                DO NOT:
                - Create a different character
                - Change any colors, clothing, or features
                - Keep the character in the forward-facing position"""

                tasks.append(generate_direction_async(
                    gemini_model, direction_prompt, generated_face_img,
                    character_id, direction_name
                ))

            return await asyncio.gather(*tasks)

        # Run async generation
        loop = asyncio.get_event_loop() if asyncio.get_event_loop().is_running() else asyncio.new_event_loop()
        if not asyncio.get_event_loop().is_running():
            generation_results = loop.run_until_complete(generate_all_directions())
        else:
            generation_results = asyncio.run(generate_all_directions())

        # Process results and create flipped versions
        for direction_name, output_path, img in generation_results:
            if output_path and img:
                # Apply background removal to the generated image
                try:
                    output_path = background_remove(output_path)
                    # Reload the image after background removal for flipping
                    img = Image.open(output_path)
                    print(f"✓ Background removed from {direction_name} image")
                except Exception as e:
                    print(f"Warning: Could not remove background from {direction_name}: {e}")

                results[direction_name] = output_path

                # Create flipped version for opposite direction
                if direction_name == 'top-left':
                    # Flip horizontally to create top-right
                    flipped_img = img.transpose(Image.FLIP_LEFT_RIGHT)
                    flipped_path = f"cache/{character_id}-top-right.png"
                    flipped_img.save(flipped_path)
                    results['top-right'] = flipped_path
                    print(f"✓ top-right view created (flipped from top-left): {flipped_path}")

                elif direction_name == 'bot-left':
                    # Flip horizontally to create bot-right
                    flipped_img = img.transpose(Image.FLIP_LEFT_RIGHT)
                    flipped_path = f"cache/{character_id}-bot-right.png"
                    flipped_img.save(flipped_path)
                    results['bot-right'] = flipped_path
                    print(f"✓ bot-right view created (flipped from bot-left): {flipped_path}")

        results['character_id'] = character_id

        # Save character ID to JSON file
        characters_file = "cache/characters.json"
        try:
            # Ensure cache directory exists
            os.makedirs("cache", exist_ok=True)

            # Load existing characters
            if os.path.exists(characters_file):
                with open(characters_file, 'r') as f:
                    characters = json.load(f)
            else:
                characters = []

            # Add new character ID if not already present
            if character_id not in characters:
                characters.append(character_id)

                # Save updated list
                with open(characters_file, 'w') as f:
                    json.dump(characters, f, indent=2)
                print(f"✓ Character ID saved to {characters_file}")
        except Exception as e:
            print(f"Warning: Could not save character ID to JSON: {e}")

        return results

    except Exception as e:
        print(f"Error in character generation: {e}")
        return None

# Example usage
if __name__ == "__main__":
    # Test character generation
    character_result = generate_character(
        description="young guy pink sweatshirt curly hair black pants a tag with his name on his shirt"
    )

    if character_result:
        print(f"\n✅ Character generation complete!")
        print(f"Character ID: {character_result['character_id']}")
        print(f"Generated files:")
        for key, path in character_result.items():
            if key != 'character_id':
                print(f"  - {key}: {path}")
    else:
        print("❌ Failed to generate character")

    # Original example (commented out)
    # result = generate_image(
    #     prompt="Create a pixel art character in isometric view, similar to Habbo Hotel style, standing on a checkered floor"
    # )
    # if result:
    #     print(f"Success! Generated image: {result}")
    # else:
    #     print("Failed to generate image")